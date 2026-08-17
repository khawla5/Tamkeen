import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

import { PATH_MAX_COURSES } from '@tamkeen/types';

export class SelectPathDto {
  @IsUUID(undefined, { message: 'PATH_NOT_FOUND' })
  pathId!: string;
}

export class SetPathCoursesDto {
  @IsArray()
  /*
   * Only the *upper* bound is checked here. The minimum of five is a
   * confirm-time rule, not a selection-time one — a user necessarily passes
   * through one, two, three selected courses while building, and rejecting
   * those would make the build page unusable.
   */
  @ArrayMaxSize(PATH_MAX_COURSES, { message: 'COURSE_COUNT_OUT_OF_RANGE' })
  @ArrayUnique({ message: 'COURSE_DUPLICATED' })
  @IsUUID(undefined, { each: true, message: 'COURSE_NOT_FOUND' })
  courseIds!: string[];
}

export class AddPathCourseDto {
  @IsUUID(undefined, { message: 'COURSE_NOT_FOUND' })
  courseId!: string;
}
