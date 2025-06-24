import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import { DataSource } from 'typeorm';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { JwtPayload } from '../../common/interfaces/jwt.payload.interface';
import { RefreshToken } from './entities/refresh-token.entity';
import { v4 as uuidv4 } from 'uuid';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    // Check if user is locked out
    await this.checkUserLockout(email);

    // Use queryRunner for transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find user with minimal data exposure
      const user = await this.usersService.findByEmail(email);

      if (!user) {
        // Constant time operation to prevent timing attacks
        await this.simulatePasswordCheck();
        await this.recordFailedAttempt(email);
        throw new UnauthorizedException('Invalid credentials');
      }

      // Constant-time password comparison
      const isPasswordValid = await this.verifyPassword(password, user.password);

      if (!isPasswordValid) {
        await this.recordFailedAttempt(email);
        throw new UnauthorizedException('Invalid credentials');
      }

      // Clear failed attempts on successful login
      await this.clearFailedAttempts(email);

      // Generate tokens
      const tokens = await this.generateTokenPair(user);

      // Store refresh token
      await this.storeRefreshToken(user.id, tokens.refreshToken, queryRunner);

      // Log successful login
      this.logger.log(`User ${user.id} logged in successfully`);

      await queryRunner.commitTransaction();

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if user already exists
      const existingUser = await this.usersService.findByEmail(registerDto.email);
      if (existingUser) {
        throw new BadRequestException('User with this email already exists');
      }

      // Create user
      const user = await this.usersService.create(registerDto);

      // Generate tokens
      const tokens = await this.generateTokenPair(user);

      // Store refresh token
      await this.storeRefreshToken(user.id, tokens.refreshToken, queryRunner);

      // Log registration
      this.logger.log(`New user registered: ${user.id}`);

      await queryRunner.commitTransaction();

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async refreshTokens(refreshToken: string): Promise<AuthResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verify refresh token
      const storedToken = await queryRunner.manager.findOne(RefreshToken, {
        where: { token: refreshToken, isActive: true },
        relations: ['user'],
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if token is blacklisted
      const isBlacklisted = await this.cacheManager.get(`blacklist:${refreshToken}`);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }

      // Invalidate old refresh token
      storedToken.isActive = false;
      await queryRunner.manager.save(storedToken);

      // Generate new token pair
      const tokens = await this.generateTokenPair(storedToken.user);

      // Store new refresh token
      await this.storeRefreshToken(storedToken.user.id, tokens.refreshToken, queryRunner);

      await queryRunner.commitTransaction();

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: storedToken.user.id,
          email: storedToken.user.email,
          name: storedToken.user.name,
          role: storedToken.user.role,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async logout(accessToken: string, userId: string): Promise<void> {
    // Blacklist the access token
    const decoded = this.jwtService.decode(accessToken) as any;
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.cacheManager.set(`blacklist:${accessToken}`, true, ttl * 1000);
      }
    }

    // Invalidate current refresh token
    await this.dataSource.manager.update(
      RefreshToken,
      { userId, isActive: true },
      { isActive: false },
    );

    this.logger.log(`User ${userId} logged out`);
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.dataSource.manager.update(RefreshToken, { userId }, { isActive: false });

    this.logger.log(`All refresh tokens revoked for user ${userId}`);
  }

  async validateUser(userId: string): Promise<User | undefined> {
    // Cache user data for performance
    const cacheKey = `user:${userId}`;
    let user = await this.cacheManager.get<User>(cacheKey);

    if (!user) {
      // user = await this.usersService.findOneSecure(userId);
      if (user) {
        await this.cacheManager.set(cacheKey, user, 300000); // 5 minutes
      }
    }

    return user;
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    const user = await this.validateUser(userId);
    if (!user) return false;

    return requiredRoles.includes(user.role);
  }

  private async generateTokenPair(user: User) {
    const jwtPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION', '15m'),
      }),
      this.jwtService.signAsync(
        { sub: user.id, type: 'refresh' },
        {
          secret: this.configService.get('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION', '7d'),
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(userId: string, token: string, queryRunner: any) {
    const refreshToken = new RefreshToken();
    refreshToken.id = uuidv4();
    refreshToken.token = token;
    refreshToken.userId = userId;
    refreshToken.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    refreshToken.isActive = true;

    await queryRunner.manager.save(refreshToken);
  }

  private async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  private async simulatePasswordCheck(): Promise<void> {
    // Simulate password hashing to prevent timing attacks
    await bcrypt.compare('dummy', '$2b$10$dummy.hash.to.prevent.timing.attacks');
  }

  private async checkUserLockout(email: string): Promise<void> {
    const lockoutKey = `lockout:${email}`;
    const lockoutData = await this.cacheManager.get(lockoutKey);

    if (lockoutData) {
      throw new UnauthorizedException('Account temporarily locked due to too many failed attempts');
    }
  }

  private async recordFailedAttempt(email: string): Promise<void> {
    const attemptsKey = `attempts:${email}`;
    const attempts = (await this.cacheManager.get<number>(attemptsKey)) || 0;
    const newAttempts = attempts + 1;

    if (newAttempts >= this.MAX_LOGIN_ATTEMPTS) {
      // Lock the account
      await this.cacheManager.set(`lockout:${email}`, true, this.LOCKOUT_DURATION);
      await this.cacheManager.del(attemptsKey);
      this.logger.warn(`Account ${email} locked due to too many failed attempts`);
    } else {
      await this.cacheManager.set(attemptsKey, newAttempts, this.LOCKOUT_DURATION);
    }
  }

  private async clearFailedAttempts(email: string): Promise<void> {
    await this.cacheManager.del(`attempts:${email}`);
  }
}
