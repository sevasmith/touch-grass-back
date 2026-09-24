import { SetMetadata } from '@nestjs/common';

export const IS_UNVERIFIED_KEY = 'allowUnverified';

export const AllowUnverified = () => SetMetadata(IS_UNVERIFIED_KEY, true);
