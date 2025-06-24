import { UsersService } from './users.service';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Test } from '@nestjs/testing';

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn(),
            })),
            remove: jest.fn(),
            merge: jest.fn(),
            manager: {
              transaction: jest.fn(),
              save: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get(getRepositoryToken(User));
  });

  describe('create', () => {
    it('should throw conflict if user exists', async () => {
      jest.spyOn(service, 'findByEmail').mockResolvedValue({} as User);
      await expect(
        service.create({ email: 'test@example.com', password: 'password', name: 'Test' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create user successfully', async () => {
      jest.spyOn(service, 'findByEmail').mockResolvedValue(null);
      repo.create.mockReturnValue({} as User);
      repo.save.mockResolvedValue({ id: '123' } as User);
    //   jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed');

      const user = await service.create({
        email: 'test@example.com',
        password: 'password',
        name: 'Test',
      });
      expect(user.id).toBe('123');
    });
  });

  describe('findAll', () => {
    it.skip('should return paginated users', async () => {
      const qb = repo.createQueryBuilder();
     ( qb.getManyAndCount as jest.Mock).mockResolvedValue([[{ id: '1' }], 1]);

      const result = await service.findAll();
      expect(result.total).toBe(1);
      expect(result.users.length).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return user by id', async () => {
      repo.findOne.mockResolvedValue({ id: '1' } as User);
      const user = await service.findOne('1');
      expect(user.id).toBe('1');
    });

    it('should throw NotFoundException if user not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      repo.findOne.mockResolvedValue({ id: '1' } as User);
      const user = await service.findByEmail('test@example.com');
      expect(user).toBeDefined();
    });

    it('should throw BadRequestException on error', async () => {
      repo.findOne.mockRejectedValue(new Error('DB fail'));
      await expect(service.findByEmail('fail@example.com')).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update and return user', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: '1', email: 'a@b.com' } as User);
      (repo.manager.transaction as jest.Mock).mockImplementation(async cb => await cb(repo.manager));
      repo.merge.mockReturnValue({ id: '1', name: 'Updated' } as any);
      (repo.manager.save as jest.Mock).mockResolvedValue({ id: '1', name: 'Updated' });

      const user = await service.update('1', { name: 'Updated' });
      expect(user.name).toBe('Updated');
    });

    it('should throw conflict on duplicate email', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: '1', email: 'a@b.com' } as User);
      jest.spyOn(service, 'findByEmail').mockResolvedValue({ id: '2' } as User);

      await expect(service.update('1', { email: 'other@example.com' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('should remove user successfully', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: '1' } as User);
      repo.remove.mockResolvedValue(undefined as any);
      await expect(service.remove('1')).resolves.not.toThrow();
    });
  });
});
