import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokensValidAfterToUsers1790941426848 implements MigrationInterface {
  name = 'AddTokensValidAfterToUsers1790941426848';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "tokensValidAfter" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "tokensValidAfter"`,
    );
  }
}
