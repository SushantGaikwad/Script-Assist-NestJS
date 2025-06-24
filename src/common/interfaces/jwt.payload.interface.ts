import { UserRole } from "../enums/user-role.enum";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}