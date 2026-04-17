import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DetectionModule } from './exceptions/detection.module';

@Module({
  imports: [DetectionModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
