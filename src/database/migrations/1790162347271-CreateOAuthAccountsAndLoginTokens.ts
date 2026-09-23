import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOAuthAccountsAndLoginTokens1790162347271 implements MigrationInterface {
  name = 'CreateOAuthAccountsAndLoginTokens1790162347271';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "oauth_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "provider" text NOT NULL, "providerAccountId" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_710a81523f515b78f894e33bb10" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4c22f13249ce02f89dc6d226e9" ON "oauth_accounts"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_55ee94ed9b32a787a45a9e9572" ON "oauth_accounts"  ("provider", "providerAccountId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "oauth_login_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "tokenHash" text NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_729bcbe4ed5f8ae12f3e79c4132" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ffad323b570af5e63fd0602e39" ON "oauth_login_tokens"  ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "oauth_accounts" ADD CONSTRAINT "FK_4c22f13249ce02f89dc6d226e9c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "oauth_login_tokens" ADD CONSTRAINT "FK_ffad323b570af5e63fd0602e391" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "oauth_login_tokens" DROP CONSTRAINT "FK_ffad323b570af5e63fd0602e391"`,
    );
    await queryRunner.query(
      `ALTER TABLE "oauth_accounts" DROP CONSTRAINT "FK_4c22f13249ce02f89dc6d226e9c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ffad323b570af5e63fd0602e39"`,
    );
    await queryRunner.query(`DROP TABLE "oauth_login_tokens"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_55ee94ed9b32a787a45a9e9572"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4c22f13249ce02f89dc6d226e9"`,
    );
    await queryRunner.query(`DROP TABLE "oauth_accounts"`);
  }
}
