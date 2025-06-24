import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RefreshTokenDto } from '../refresh-token.dto';

describe('RefreshTokenDto Validation', () => {
  it('should validate successfully with a valid refresh token string', async () => {
    const dto = plainToInstance(RefreshTokenDto, {
      refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation if refreshToken is missing', async () => {
    const dto = plainToInstance(RefreshTokenDto, {});

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('refreshToken');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should fail validation if refreshToken is not a string', async () => {
    const dto = plainToInstance(RefreshTokenDto, {
      refreshToken: 123456,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('refreshToken');
    expect(errors[0].constraints).toHaveProperty('isString');
  });

  it('should fail validation if refreshToken is an empty string', async () => {
    const dto = plainToInstance(RefreshTokenDto, {
      refreshToken: '',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('refreshToken');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });
});
