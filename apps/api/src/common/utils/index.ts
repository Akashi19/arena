import { randomBytes } from 'node:crypto';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Slug único con sufijo aleatorio corto (enlaces públicos compartibles). */
export function uniqueSlug(input: string): string {
  const base = slugify(input) || 'item';
  return `${base}-${randomBytes(3).toString('hex')}`;
}

export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 12;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Campos públicos del organizador que acompañan a torneos, tarjetas, etc. */
export const organizerPublicSelect = {
  id: true,
  displayName: true,
  logoUrl: true,
  primaryColor: true,
  organizerType: true,
  verificationStatus: true,
  verifiedAt: true,
  country: true,
  city: true,
  user: { select: { username: true } },
  reputation: {
    select: { averageScore: true, totalRatings: true, reputationLevel: true, completionRate: true, lastCalculatedAt: true },
  },
} as const;
