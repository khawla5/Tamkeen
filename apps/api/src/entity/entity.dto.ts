import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** §4B.2's filter and search. */
export class EntityCourseQueryDto {
  @IsOptional()
  @IsString()
  /* Bounded so a search cannot be used to push an arbitrarily large pattern
     into a database LIKE. */
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'UNPUBLISHED'])
  publication?: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
}
