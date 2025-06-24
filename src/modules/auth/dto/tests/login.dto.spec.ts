import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../login.dto';

describe('LoginDto Validation', () => {
  it('should validate successfully with correct email and password', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: 'password123',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation if email is missing', async () => {
    const dto = plainToInstance(LoginDto, {
      password: 'password123',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('email');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should fail validation if password is missing', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('password');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should fail validation if email is invalid', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'invalid-email',
      password: 'password123',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('email');
    expect(errors[0].constraints).toHaveProperty('isEmail');
  });

  it('should fail validation if password is too short', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: '123',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('password');
    expect(errors[0].constraints).toHaveProperty('minLength');
  });

  it('should fail validation if both fields are empty strings', async () => {
    const dto = plainToInstance(LoginDto, {
      email: '',
      password: '',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(2);
    const fields = errors.map((e) => e.property);
    expect(fields).toContain('email');
    expect(fields).toContain('password');
  });
});
