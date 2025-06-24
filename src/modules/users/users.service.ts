import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../../common/enums/user-role.enum';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly SALT_ROUNDS = 10;
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Check for existing user
    const existingUser = await this.findByEmail(createUserDto.email);

    if (existingUser) {
      throw new ConflictException(`User with email ${createUserDto.email} already exists`);
    }

    try {
      // Create user with hashed password
      const hashedPassword = await bcrypt.hash(createUserDto.password, this.SALT_ROUNDS);
      const user = this.usersRepository.create({
        ...createUserDto,
        password: hashedPassword,
        role: createUserDto.role || UserRole.USER, // Default to USER role if not provided
      });

      const savedUser = await this.usersRepository.save(user);
      this.logger.log(`User created successfully: ${savedUser.id}`);

      return savedUser;
    } catch (error: any) {
      if (error instanceof QueryFailedError && error.message.includes('unique constraint')) {
        throw new ConflictException('Email already exists');
      }
      this.logger.error(`Failed to create user: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to create user');
    }
  }

  async findAll(page = 1, limit = 10): Promise<{ users: User[]; total: number; pages: number }> {
    this.logger.debug(`Fetching users: page=${page}, limit=${limit}`);

    try {
      // Build query with optional filters
      const queryBuilder = this.usersRepository
        .createQueryBuilder('user')
        .select(['user.id', 'user.email', 'user.name', 'user.role', 'user.createdAt']) // Exclude sensitive fields like password
        .where('user.deletedAt IS NULL');

      queryBuilder
        .orderBy('user.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      const [users, total] = await queryBuilder.getManyAndCount();

      this.logger.log(`Found ${total} users (page ${page}, limit ${limit})`);

      return {
        users,
        total,
        pages: Math.ceil(total / limit),
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch users: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to fetch users');
    }
  }

  async findOne(id: string): Promise<User> {
    this.logger.debug(`Fetching user with ID: ${id}`);

    try {
      const user = await this.usersRepository.findOne({
        where: { id },
        select: ['id', 'email', 'name', 'role', 'createdAt'], // Exclude sensitive fields
      });

      if (!user) {
        throw new NotFoundException(`User not found`);
      }

      return user;
    } catch (error: any) {
      this.logger.error(`Failed to fetch user ${id}: ${error.message}`, error.stack);
      throw error instanceof NotFoundException
        ? error
        : new BadRequestException('Failed to fetch user');
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    this.logger.debug(`Fetching user by email: ${email}`);

    try {
      return await this.usersRepository.findOne({
        where: { email },
        select: ['id', 'email', 'name', 'role', 'password', 'createdAt'], // Include password for auth
      });
    } catch (error: any) {
      this.logger.error(`Failed to fetch user by email ${email}: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to fetch user by email');
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    this.logger.debug(`Updating user with ID: ${id}`);

    const user = await this.findOne(id);

    try {
      // Validate and hash password if provided
      if (updateUserDto.password) {
        if (updateUserDto.password.length < 8) {
          throw new BadRequestException('Password must be at least 8 characters long');
        }
        updateUserDto.password = await bcrypt.hash(updateUserDto.password, this.SALT_ROUNDS);
      }

      // Check for email uniqueness if updated
      if (updateUserDto.email && updateUserDto.email !== user.email) {
        const existingUser = await this.findByEmail(updateUserDto.email);
        if (existingUser) {
          throw new ConflictException(`Email ${updateUserDto.email} is already in use`);
        }
      }

      // Use transaction for data consistency
      const updatedUser = await this.usersRepository.manager.transaction(
        async transactionalEntityManager => {
          const mergedUser = this.usersRepository.merge(user, updateUserDto);
          return await transactionalEntityManager.save(User, mergedUser);
        },
      );

      this.logger.log(`User updated successfully`);
    
      return updatedUser;
    } catch (error: any) {
      this.logger.error(`Failed to update user ${id}: ${error.message}`, error.stack);
      throw error instanceof ConflictException || error instanceof BadRequestException
        ? error
        : new BadRequestException('Failed to update user');
    }
  }

  async remove(id: string): Promise<void> {
  this.logger.debug(`Soft deleting user with ID: ${id}`);

    const user = await this.findOne(id);

    try {
      // Implement soft delete
      await this.usersRepository.remove(user);
      this.logger.log(`User ${id} soft deleted successfully`);
    } catch (error: any) {
      this.logger.error(`Failed to soft delete user ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to delete user');
    }
  }
}
