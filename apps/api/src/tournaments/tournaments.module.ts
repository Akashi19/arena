import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators/auth.decorators.js';
import { MAX_IMAGE_BYTES } from '../storage/storage.service.js';
import { TournamentsService } from './tournaments.service.js';
import { MatchesModule } from '../matches/matches.js';
import {
  CancelTournamentDto,
  ChangeStatusDto,
  CreateTournamentDto,
  DecideRegistrationDto,
  MyTournamentsQuery,
  RegistrationListQuery,
  RequestRegistrationDto,
  TournamentListQuery,
  UpdateTournamentDto,
} from './dto/tournament.dto.js';

@ApiTags('Partidas y torneos')
@Controller()
export class TournamentsController {
  constructor(private readonly service: TournamentsService) {}

  @Public()
  @Get('home')
  home() {
    return this.service.home();
  }

  @Public()
  @Get('tournaments')
  list(@Query() q: TournamentListQuery) {
    return this.service.list(q);
  }

  /** Acepta slug (enlace público compartible) o UUID. */
  @Public()
  @Get('tournaments/:slugOrId')
  detail(@Param('slugOrId') slugOrId: string, @CurrentUser() user?: AuthUser) {
    return this.service.detail(slugOrId, user);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Post('tournaments')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTournamentDto) {
    return this.service.create(user, dto);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Patch('tournaments/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTournamentDto) {
    return this.service.update(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Patch('tournaments/:id/status')
  status(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeStatusDto) {
    return this.service.changeStatus(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Post('tournaments/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelTournamentDto) {
    return this.service.cancel(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Post('tournaments/:id/cover')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  cover(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    return this.service.uploadCover(user, id, file);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Get('me/tournaments')
  mine(@CurrentUser() user: AuthUser, @Query() q: MyTournamentsQuery) {
    return this.service.mine(user, q);
  }

  // ---------------------------------------------------------------- Inscripciones

  @ApiBearerAuth()
  @Post('tournaments/:id/registrations')
  register(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestRegistrationDto) {
    return this.service.requestRegistration(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Get('tournaments/:id/registrations')
  registrations(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: RegistrationListQuery) {
    return this.service.registrations(user, id, q);
  }

  @ApiBearerAuth()
  @Roles('ORGANIZER')
  @Patch('registrations/:id')
  decide(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideRegistrationDto) {
    return this.service.decide(user, id, dto);
  }

  @ApiBearerAuth()
  @Delete('registrations/:id')
  withdraw(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.withdraw(user, id);
  }

  @ApiBearerAuth()
  @Get('me/registrations')
  myRegistrations(@CurrentUser() user: AuthUser) {
    return this.service.myRegistrations(user);
  }
}

@Module({ imports: [MatchesModule], controllers: [TournamentsController], providers: [TournamentsService], exports: [TournamentsService] })
export class TournamentsModule {}
