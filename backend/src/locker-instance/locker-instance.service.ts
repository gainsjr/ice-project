import { forwardRef, Inject, Injectable, NotFoundException, UnauthorizedException, HttpException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { LockerInstanceRepositoryToken, CanAccessRelationRepositoryToken } from '../constant';
import { CanAccessRelation } from '../entities/can-access.entity';
import { LockerInstance } from '../entities/locker-instance.entity';
import { LockerUsage } from '../entities/locker-usage.entity';
import { LockerUsageService } from '../locker-usage/locker-usage.service';
import { LockerService } from '../locker/locker.service';
import { QrService } from '../qr/qr.service';
import { UserService } from '../user/user.service';
import { CreditUsageService } from '../credit-usage/credit-usage.service';

@Injectable()
export class LockerInstanceService {
    constructor(
        @Inject(LockerInstanceRepositoryToken)
        private readonly lockerInstanceRepository: Repository<LockerInstance>,
        private readonly qrService: QrService,
        @Inject(forwardRef(() => LockerService))
        private readonly lockerService: LockerService,
        private readonly lockerUsageService: LockerUsageService,
        private readonly userService: UserService,
        private readonly creditUsageService: CreditUsageService,
        @Inject(CanAccessRelationRepositoryToken)
        private readonly canAccessRelationRepository: Repository<CanAccessRelation>,
    ) { }

    public async create(accessCode: string, nationalID: string): Promise<LockerInstance> {
        try {
            const locker = await this.qrService.findLockerByAccessCodeOrFail(accessCode);
            const activeLocker = await this.lockerService.findLocker({ key: { activeLockerID: locker.id } });
            const user = await this.userService.findUser({ key: { nationalID } });
            const currentLockerInstance = await this.findInstance({
                key: { inUsedLockerID: activeLocker.id },
                throwError: false,
            });
            if (currentLockerInstance) {
                throw new ConflictException('Locker is in used');
            }
            let lockerInstance = new LockerInstance(activeLocker, user);
            await this.lockerInstanceRepository.save(lockerInstance);
            lockerInstance = await this.findInstance({ key: { inUsedLockerID: activeLocker.id } });
            const canAccessRelation = new CanAccessRelation(user, lockerInstance);
            await this.canAccessRelationRepository.save(canAccessRelation);
            return lockerInstance;
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            } else {
                throw new NotFoundException(error.message);
            }
        }
    }

    public async findInstance({
        key,
        throwError = true,
        joinWith = [],
        nestedJoin = [],
    }: {
        key: {
            instance?: {
                lockerID: number;
                startTime: Date;
            };
            inUsedLockerID?: number;
        };
        throwError?: boolean;
        joinWith?: Array<keyof LockerInstance>;
        nestedJoin?: string[];
    }): Promise<LockerInstance> {
        const relations: string[] = [...joinWith, ...nestedJoin];
        try {
            if (key.instance) {
                const where: Partial<LockerInstance> = { lockerID: key.instance.lockerID, startTime: key.instance.startTime };
                if (throwError) {
                    return await this.lockerInstanceRepository.findOneOrFail({ where, relations });
                } else {
                    return await this.lockerInstanceRepository.findOne({ where, relations });
                }
            }
            if (key.inUsedLockerID) {
                const where: Partial<LockerInstance> = { lockerID: key.inUsedLockerID, inUsed: true };
                if (throwError) {
                    return await this.lockerInstanceRepository.findOneOrFail({ where, relations });
                } else {
                    return await this.lockerInstanceRepository.findOne({ where, relations });
                }
            }
            throw new Error('One of the key must be specify');
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            } else {
                throw new NotFoundException(error.message);
            }
        }
    }

    public async findInstances({
        key,
        joinWith = [],
        nestedJoin = [],
    }: {
        key?: {
            inUsed?: boolean;
            inUsedByNationalID?: string;
            accessibleLockerByNationalID?: string;
        };
        joinWith?: Array<keyof LockerInstance>;
        nestedJoin?: string[];
    }): Promise<LockerInstance[]> {
        const relations: string[] = [...joinWith, ...nestedJoin];
        if (key.inUsed) {
            return await this.lockerInstanceRepository.find({ where: { inUsed: key.inUsed } });
        }
        if (key.inUsedByNationalID) {
            return await this.lockerInstanceRepository.find({ where: { userID: key.inUsedByNationalID, inUsed: true }, relations });
        }
        return await this.lockerInstanceRepository.find({ relations });
    }

    public async findCanAccessRelation({
        key,
        throwError = true,
        joinWith = [],
        nestedJoin = [],
    }: {
        key: {
            relation?: {
                startTime: string;
                lockerID: number;
                nationalID: string;
            };
        };
        throwError?: boolean;
        joinWith?: Array<keyof CanAccessRelation>;
        nestedJoin?: string[];
    }): Promise<CanAccessRelation> {
        const relations: string[] = [...joinWith, ...nestedJoin];
        if (key.relation) {
            const where: Partial<CanAccessRelation> | { startTime: string } = {
                startTime: key.relation.startTime,
                lockerID: key.relation.lockerID,
                nationalID: key.relation.nationalID,
            };
            if (throwError) {
                return await this.canAccessRelationRepository.findOneOrFail({ where, relations });
            } else {
                return await this.canAccessRelationRepository.findOne({ where, relations });
            }
        }
        throw new Error('One of the key must be specify');
    }

    public async findCanAccessRelations({
        key,
        joinWith = [],
        nestedJoin = [],
    }: {
        key?: {
            nationalID?: string;
        };
        joinWith?: Array<keyof CanAccessRelation>;
        nestedJoin?: string[];
    }): Promise<CanAccessRelation[]> {
        const relations: string[] = [...joinWith, ...nestedJoin];
        if (key.nationalID) {
            const canAccessRelations = await this.canAccessRelationRepository.find({
                where: { nationalID: key.nationalID, },
                relations,
            });
            return canAccessRelations.filter(
                canAccessRelation =>
                    canAccessRelation.accessibleLockerInstance.inUsed && canAccessRelation.accessibleLockerInstance.userID !== key.nationalID,
            );
        }
        return await this.canAccessRelationRepository.find({ relations });
    }

    public async deleteInstance(lockerID: number, startTime: Date) {
        try {
            const lockerInstance = await this.findInstance({
                key: { instance: { lockerID, startTime } },
            });
            await this.lockerInstanceRepository.delete(lockerInstance);
        } catch (error) {
            throw new NotFoundException(error.message);
        }
    }

    public async addPermissionFromNationalIDAndLockerID(nationalID: string, lockerID: number) {
        try {
            const user = await this.userService.findUser({ key: { nationalID } });
            const lockerInstance = await this.findInstance({ key: { inUsedLockerID: lockerID } });
            const canAccessRelation = new CanAccessRelation(user, lockerInstance);
            await this.canAccessRelationRepository.save(canAccessRelation);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            } else {
                throw new NotFoundException(error.message);
            }
        }
    }

    public async revokePermissionFromNationalIDAndLockerID(ownerNationalID: string, nationalID: string, lockerID: number) {
        try {
            const lockerInstance = await this.findInstance({
                key: { inUsedLockerID: lockerID },
                joinWith: ['canAccesses'],
            });
            if (lockerInstance.userID !== ownerNationalID) {
                throw new UnauthorizedException('Not owner of locker');
            }
            const index = lockerInstance.canAccesses.findIndex((canAccess) => canAccess.nationalID === nationalID);
            if (index === -1) {
                throw new NotFoundException(`User with nationalID "${nationalID}" does not have permission to access`);
            }
            lockerInstance.canAccesses.splice(index, 1);
            this.lockerInstanceRepository.save(lockerInstance);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            } else {
                throw new NotFoundException(error.message);
            }
        }
    }

    public async unlock(nationalID: string, accessCode: string): Promise<LockerUsage> {
        try {
            const locker = await this.qrService.findLockerByAccessCodeOrFail(accessCode);
            const activeLocker = await this.lockerService.isLockerActiveByLockerID(locker.id);
            if (!activeLocker) {
                throw new NotFoundException('Not found "ACTIVE" Locker');
            }
            const lockerInstance = await this.findInstance({ key: { inUsedLockerID: locker.id } });
            const canAccessRelation = await this.findCanAccessRelation({
                key: {
                    relation: {
                        startTime: lockerInstance.startTime.toISOString(),
                        lockerID: lockerInstance.lockerID,
                        nationalID,
                    },
                },
                throwError: false,
            });
            const user = await this.userService.findUser({ key: { nationalID } });
            if (canAccessRelation) {
                return await this.lockerUsageService.unlock(lockerInstance, user);
            } else {
                throw new UnauthorizedException('User is not allowed to access this locker');
            }
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            } else {
                throw new NotFoundException(error.message);
            }
        }
    }

    public async returnInstance(nationalID: string, accessCode: string) {
        try {
            const locker = await this.qrService.findLockerByAccessCodeOrFail(accessCode);
            const lockerInstance = await this.findInstance({ key: { inUsedLockerID: locker.id } });
            if (lockerInstance.userID !== nationalID) {
                throw new UnauthorizedException('Not owner of in used locker instance');
            }
            lockerInstance.endTime = new Date();
            lockerInstance.inUsed = false;
            await this.lockerInstanceRepository.save(lockerInstance);
            await this.creditUsageService.calculateTimeCharge(lockerInstance.startTime, lockerInstance.endTime, nationalID);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            } else {
                throw new NotFoundException(error.message);
            }
        }
    }
}
