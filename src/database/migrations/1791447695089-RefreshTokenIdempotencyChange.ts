import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshTokenIdempotencyChange1791447695089 implements MigrationInterface {
  name = 'RefreshTokenIdempotencyChange1791447695089';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "replacedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "replacementId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "replacementCipher" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "replacementCipher"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "replacementId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "replacedAt"`,
    );
  }
}
