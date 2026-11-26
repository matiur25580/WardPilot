import { z } from 'zod';

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(12).max(128).regex(/[a-z]/, 'Password must include a lowercase letter.').regex(/[A-Z]/, 'Password must include an uppercase letter.').regex(/[0-9]/, 'Password must include a number.');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  organizationName: z.string().trim().min(2).max(120),
});
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
