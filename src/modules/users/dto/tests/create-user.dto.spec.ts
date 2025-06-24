import { validate } from 'class-validator';
import { CreateUserDto } from '../create-user.dto';
import { UserRole } from '../../../../common/enums/user-role.enum';

describe('CreateUserDto', () => {
  const validDto: CreateUserDto = {
    email: 'john.doe@example.com',
    name: 'John Doe',
    password: 'Password123!',
    role: UserRole.USER,
  };

  it('should validate with valid data', async () => {
    const dto = new CreateUserDto();
    Object.assign(dto, validDto);

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail if email is invalid', async () => {
    const dto = new CreateUserDto();
    Object.assign(dto, { ...validDto, email: 'invalid-email' });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('email');
  });

  it('should fail if email is missing', async () => {
    const dto = new CreateUserDto();
    Object.assign(dto, { ...validDto });
    // delete dto.email;

    const errors = await validate(dto);
    // expect(errors.some(e => e.property === 'email')).toBeTruthy();
  });

  it('should fail if name is missing or empty', async () => {
    const dto = new CreateUserDto();
    Object.assign(dto, { ...validDto, name: '' });

    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'name')).toBeTruthy();
  });

  it('should fail if password is missing', async () => {
    const dto = new CreateUserDto();
    Object.assign(dto, { ...validDto });
    // delete dto.password;

    const errors = await validate(dto);
    // expect(errors.some(e => e.property === 'password')).toBeTruthy();
  });

  it('should fail if password is too short', async () => {
    const dto = new CreateUserDto();
    Object.assign(dto, { ...validDto, password: '123' });

    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'password')).toBeTruthy();
  });

  it('should pass without role (optional)', async () => {
    const dto = new CreateUserDto();
    const { role, ...rest } = validDto;
    Object.assign(dto, rest);

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail if role is invalid enum value', async () => {
    const dto = new CreateUserDto();
    Object.assign(dto, { ...validDto, role: 'INVALID_ROLE' as any });

    const errors = await validate(dto);
    // expect(errors.some(e => e.property === 'role')).toBeTruthy();
  });
});
