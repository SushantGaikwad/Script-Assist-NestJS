import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserResponseDto, AuthResponseDto } from '../auth-response.dto';
import { error } from 'console';

describe('UserResponseDto Validation', () => {
  it('should validate a valid UserResponseDto instance', async () => {
    const dto = plainToInstance(UserResponseDto, {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'user@example.com',
      name: 'John Doe',
      role: 'user',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

describe('AuthResponseDto Validation', () => {
  it('should validate a correct AuthResponseDto', async () => {
    const user = plainToInstance(UserResponseDto, {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      name: 'Tester',
      role: 'admin',
    });

    const dto = plainToInstance(AuthResponseDto, {
      accessToken: 'valid-access-token',
      refreshToken: 'valid-refresh-token',
      user,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

});
