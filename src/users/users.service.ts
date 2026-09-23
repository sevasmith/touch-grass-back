import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findByIdWithPassword(id: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id })
      .getOne();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOneBy({ email });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }

  async updateLastLoginAt(id: string): Promise<void> {
    await this.userRepository.update(id, { lastLoginAt: new Date() });
  }

  async create(email: string, passwordHash: string): Promise<User> {
    const user = this.userRepository.create({ email, passwordHash });
    try {
      return await this.userRepository.save(user);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        'code' in err &&
        err.code === '23505'
      ) {
        throw new ConflictException('Email already exists');
      }
      throw err;
    }
  }

  async resetPassword(
    id: string,
    passwordHash: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.withRepository(this.userRepository)
      : this.userRepository;
    await repository.update(id, {
      passwordHash,
      passwordChangedAt: new Date(),
    });
  }
}
