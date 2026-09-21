import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordChangedAtToUsers1790001560245 implements MigrationInterface {
  name = 'AddPasswordChangedAtToUsers1790001560245';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "passwordChangedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "passwordChangedAt"`,
    );
  }
}
