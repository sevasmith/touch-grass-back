import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: getDataSourceToken(), useValue: { query } }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns ok when the database responds', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
  });

  it('throws ServiceUnavailableException when the database query fails', async () => {
    query.mockRejectedValue(new Error('connection refused'));
    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
