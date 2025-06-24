import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from '../../common/enums/user-role.enum';

const mockUsersService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create()', () => {
    it('should create a user', async () => {
      const dto: CreateUserDto = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
        role: UserRole.USER,
      };
      const result = { id: '1', ...dto };
      mockUsersService.create.mockResolvedValue(result);

      expect(await controller.create(dto)).toEqual(result);
      expect(mockUsersService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll()', () => {
    it('should return paginated users', async () => {
      const result = {
        users: [],
        total: 0,
        pages: 0,
      };
      mockUsersService.findAll.mockResolvedValue(result);

      expect(await controller.findAll(1, 10)).toEqual(result);
      expect(mockUsersService.findAll).toHaveBeenCalledWith(1, 10);
    });
  });

  describe('findOne()', () => {
    it('should return a user by ID', async () => {
      const result = { id: '123', email: 'a@b.com', name: 'Alpha' };
      mockUsersService.findOne.mockResolvedValue(result);

      expect(await controller.findOne('123')).toEqual(result);
      expect(mockUsersService.findOne).toHaveBeenCalledWith('123');
    });
  });

  describe('update()', () => {
    it('should update a user by ID', async () => {
      const dto: UpdateUserDto = { name: 'Updated' };
      const result = { id: '1', ...dto };
      mockUsersService.update.mockResolvedValue(result);

      expect(await controller.update('1', dto)).toEqual(result);
      expect(mockUsersService.update).toHaveBeenCalledWith('1', dto);
    });
  });

  describe('remove()', () => {
    it('should remove a user by ID', async () => {
      mockUsersService.remove.mockResolvedValue(undefined);

      await controller.remove('1');
      expect(mockUsersService.remove).toHaveBeenCalledWith('1');
    });
  });
});
