import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeUserPasswordHashNullable1790161748630 implements MigrationInterface {
  name = 'MakeUserPasswordHashNullable1790161748630';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "passwordHash" SET NOT NULL`,
    );
  }
}
