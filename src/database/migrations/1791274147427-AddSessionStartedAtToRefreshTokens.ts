import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionStartedAtToRefreshTokens1791274147427 implements MigrationInterface {
  name = 'AddSessionStartedAtToRefreshTokens1791274147427';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "sessionStartedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "sessionStartedAt"`,
    );
  }
}
