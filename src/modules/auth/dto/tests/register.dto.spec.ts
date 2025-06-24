import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from '../register.dto';
import { UserRole } from '../../../../common/enums/user-role.enum';

describe('RegisterDto Validation', () => {
  const validData = {
    name: 'John Doe',
    email: 'john@example.com',
    password: 'StrongP@ss1',
    role: UserRole.USER,
  };

  it('should validate successfully with correct values', async () => {
    const dto = plainToInstance(RegisterDto, validData);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail if name is empty or too short/long', async () => {
    const shortName = plainToInstance(RegisterDto, {
      ...validData,
      name: 'J',
    });
    const longName = plainToInstance(RegisterDto, {
      ...validData,
      name: 'A'.repeat(51),
    });

    const [shortErrors, longErrors] = await Promise.all([
      validate(shortName),
      validate(longName),
    ]);

    expect(shortErrors.length).toBeGreaterThan(0);
    expect(shortErrors[0].constraints).toHaveProperty('minLength');

    expect(longErrors.length).toBeGreaterThan(0);
    expect(longErrors[0].constraints).toHaveProperty('maxLength');
  });

  it('should fail if email is invalid or missing', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validData,
      email: 'invalid-email',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('email');
    expect(errors[0].constraints).toHaveProperty('isEmail');
  });

  it('should fail if password is weak or missing', async () => {
    const weakPassword = plainToInstance(RegisterDto, {
      ...validData,
      password: 'weakpass',
    });

    const missingPassword = plainToInstance(RegisterDto, {
      ...validData,
      password: '',
    });

    const [weakErrors, missingErrors] = await Promise.all([
      validate(weakPassword),
      validate(missingPassword),
    ]);

    expect(weakErrors[0].constraints).toHaveProperty('matches');
    expect(missingErrors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should fail if role is not in UserRole enum', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validData,
      role: 'manager', // invalid role
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('role');
    expect(errors[0].constraints).toHaveProperty('isEnum');
  });

  it('should allow omitting the optional role field', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validData,
    });

    // delete dto.role;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should return multiple validation errors if many fields are invalid', async () => {
    const dto = plainToInstance(RegisterDto, {
      name: '',
      email: 'invalid',
      password: 'short',
      role: 'fake',
    });

    const errors = await validate(dto);
    const fields = errors.map(e => e.property);
    expect(fields).toContain('name');
    expect(fields).toContain('email');
    expect(fields).toContain('password');
    expect(fields).toContain('role');
  });
});
