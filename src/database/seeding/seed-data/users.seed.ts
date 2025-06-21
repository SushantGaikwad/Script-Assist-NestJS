import * as bcrypt from 'bcrypt';
import { UserRole } from '../../../common/enums/user-role.enum';

export const users = [
  {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'admin@example.com',
    name: 'Admin User',
    password: bcrypt.hashSync('admin123', 10),
    role: UserRole.ADMIN,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    email: 'user@example.com',
    name: 'Normal User',
    password: bcrypt.hashSync('user123', 10),
    role: UserRole.USER
  },
]; 