import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as path from 'path';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true
  }));

  // Serve frontend static files
  // When packaged with pkg: look next to the .exe in dist/public/
  // In dev: look at frontend/dist/
  const isPkg = typeof (process as any).pkg !== 'undefined';
  const staticDir = isPkg
    ? path.join(path.dirname(process.execPath), 'public')
    : path.join(__dirname, '..', '..', '..', 'frontend', 'dist');

  app.useStaticAssets(staticDir);
  app.setBaseViewsDir(staticDir);

  // SPA fallback — serve index.html for any unmatched route
  app.use((req: any, res: any, next: any) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/detection') || req.url.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  const config = new DocumentBuilder()
    .setTitle('Visual Object Detection API')
    .setVersion('1.0')
    .build()

  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, config))

  await app.listen(3001);
}

bootstrap();
