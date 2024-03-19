import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { BaseballService } from './baseball.service';
import { BasketballService } from './basketball.service';
import { FootballService } from './football.service';
import { NearService } from './near.service';
@Module({
  providers: [BaseballService, BasketballService, FootballService, NearService],
})
export class TasksModule {}
