import { Body, Controller, Get, Put } from '@nestjs/common';

import type { CvView } from '@tamkeen/types';

import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { SaveCvDto } from './cv.dto';
import { CvService } from './cv.service';

/** The CV builder (§4.11). Always the caller's own CV — there is no id here. */
@Controller('cv')
export class CvController {
  constructor(private readonly cv: CvService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<CvView> {
    return this.cv.get(user.id);
  }

  /**
   * **PUT, not PATCH**: §4.11 asks for one save, and the document is written
   * whole. Reordering entries, removing one, and editing another are the same
   * operation on a CV form — modelling them as partial updates would invent a
   * merge problem the product does not have.
   */
  @Put()
  save(@CurrentUser() user: AuthenticatedUser, @Body() body: SaveCvDto): Promise<CvView> {
    return this.cv.save(user.id, body);
  }
}
