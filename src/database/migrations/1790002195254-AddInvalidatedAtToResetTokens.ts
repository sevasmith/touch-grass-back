import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvalidatedAtToResetTokens1790002195254 implements MigrationInterface {
  name = 'AddInvalidatedAtToResetTokens1790002195254';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reset_tokens" ADD "invalidatedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reset_tokens" DROP COLUMN "invalidatedAt"`,
    );
  }
}
