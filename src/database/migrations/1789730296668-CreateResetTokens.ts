import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResetTokens1789730296668 implements MigrationInterface {
  name = 'CreateResetTokens1789730296668';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "tokenHash" text NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_acd6ec48b54150b1736d0b454b9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_69015e2482e433b6d218ad0faf" ON "reset_tokens"  ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "reset_tokens" ADD CONSTRAINT "FK_69015e2482e433b6d218ad0faf6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reset_tokens" DROP CONSTRAINT "FK_69015e2482e433b6d218ad0faf6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_69015e2482e433b6d218ad0faf"`,
    );
    await queryRunner.query(`DROP TABLE "reset_tokens"`);
  }
}
