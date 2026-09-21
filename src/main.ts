import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      enableDebugMessages: process.env.NODE_ENV !== 'production',
    }),
  );

  app.use(helmet({ contentSecurityPolicy: false }));

  const configService = app.get(ConfigService);
  const corsOrigins = configService
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim());

  app.enableCors({
    origin: corsOrigins,
  });

  await app.listen(process.env.PORT ?? 6767);
}
bootstrap();
