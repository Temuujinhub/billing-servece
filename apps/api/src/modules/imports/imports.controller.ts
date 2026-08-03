import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { ImportsService } from './imports.service';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /** Wizard step 1: parse only — columns, samples, suggested mapping. */
  @Roles(Role.OPERATOR)
  @HttpCode(200)
  @Post('inspect')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  inspect(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw apiError(HttpStatus.BAD_REQUEST, 'FILE_REQUIRED', 'Файл сонгоно уу (дээд тал нь 5MB).', 'Attach a file (max 5MB).');
    }
    return this.imports.inspect(file);
  }

  /** Wizard step 2: re-upload with the confirmed column mapping (JSON). */
  @Roles(Role.OPERATOR)
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
    @Body('mapping') mapping?: string,
  ) {
    if (!file) {
      throw apiError(HttpStatus.BAD_REQUEST, 'FILE_REQUIRED', 'Файл сонгоно уу (дээд тал нь 5MB).', 'Attach a file (max 5MB).');
    }
    return this.imports.upload(user, file, mapping);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('take') take?: number, @Query('skip') skip?: number) {
    return this.imports.listBatches(user.tenantId, take ?? 20, skip ?? 0);
  }

  @Get(':id')
  preview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.imports.preview(user.tenantId, id);
  }

  @Roles(Role.OPERATOR)
  @HttpCode(200)
  @Post(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.imports.approve(user, id);
  }
}
