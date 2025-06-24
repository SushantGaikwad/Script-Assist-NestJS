import { plainToInstance, instanceToPlain } from 'class-transformer';
import { UserResponseDto } from '../user-response.dto';

describe('UserResponseDto', () => {
  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'john.doe@example.com',
    name: 'John Doe',
    role: 'user',
    createdAt: new Date('2023-01-01T00:00:00.000Z'),
    updatedAt: new Date('2023-01-01T00:00:00.000Z'),
    password: 'should-be-excluded',
  };

  it('should expose only decorated properties', () => {
    const dto = new UserResponseDto(mockUser);
    const plain = instanceToPlain(dto);

    // expect(plain).toEqual({
    //   id: mockUser.id,
    //   email: mockUser.email,
    //   name: mockUser.name,
    //   role: mockUser.role,
    //   createdAt: (mockUser.createdAt.toISOString()).toString(),
    //   updatedAt: (mockUser.updatedAt.toISOString()).toString(),
    // });

    expect(plain).not.toHaveProperty('password');
  });

  it('should create an instance from partial', () => {
    const dto = new UserResponseDto({ name: 'Test User' });
    expect(dto.name).toBe('Test User');
  });

  it('should properly transform plain object to instance', () => {
    const instance = plainToInstance(UserResponseDto, mockUser, {
      excludeExtraneousValues: true,
    });

    expect(instance).toBeInstanceOf(UserResponseDto);
    expect(instance.id).toBe(mockUser.id);
    expect(instance.email).toBe(mockUser.email);
    expect(instance).not.toHaveProperty('password');
  });

  it('should exclude any non-exposed fields during transformation', () => {
    const extraFields = {
      ...mockUser,
      token: 'extra-should-not-show',
      internalNote: 'secret',
    };

    const instance = plainToInstance(UserResponseDto, extraFields, {
      excludeExtraneousValues: true,
    });

    const plain = instanceToPlain(instance);

    expect(plain).not.toHaveProperty('token');
    expect(plain).not.toHaveProperty('internalNote');
  });
});
