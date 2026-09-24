import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmailVerificationCodes1790259164079 implements MigrationInterface {
  name = 'CreateEmailVerificationCodes1790259164079';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "email_verification_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "codeHash" text NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "invalidatedAt" TIMESTAMP WITH TIME ZONE, "attempts" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5bb1cbeebcbcb38996911bff8d4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_97bef998b0d463cb053643822a" ON "email_verification_codes"  ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "email_verification_codes" ADD CONSTRAINT "FK_97bef998b0d463cb053643822a3" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_verification_codes" DROP CONSTRAINT "FK_97bef998b0d463cb053643822a3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97bef998b0d463cb053643822a"`,
    );
    await queryRunner.query(`DROP TABLE "email_verification_codes"`);
  }
}
