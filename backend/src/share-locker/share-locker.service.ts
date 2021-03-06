import { Injectable, Inject, UnauthorizedException, NotFoundException, HttpException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { Repository } from 'typeorm';
import { UserInvitationRepositoryToken } from '../constant';
import { UserInvitation } from '../entities/user-invitation.entity';
import { LockerInstanceService } from '../locker-instance/locker-instance.service';
import { ConfigService } from '../config/config.service';

@Injectable()
export class ShareLockerService {
    constructor(
        @Inject(UserInvitationRepositoryToken)
        private readonly userInvitationRepository: Repository<UserInvitation>,
        private readonly userService: UserService,
        private readonly configService: ConfigService,
        private readonly lockerInstanceService: LockerInstanceService,
    ) { }

    public async findUserInvitation({
        key,
        throwError = true,
        joinWith = [],
        nestedJoin = [],
    }: {
        key: {
            id?: string
        };
        throwError?: boolean;
        joinWith?: Array<keyof UserInvitation>;
        nestedJoin?: string[];
    }): Promise<UserInvitation> {
        const relations: string[] = [...joinWith, ...nestedJoin];
        if (key.id) {
            const where: Partial<UserInvitation> = { id: key.id, isUsed: false };
            if (throwError) {
                return await this.userInvitationRepository.findOneOrFail({ where, relations });
            } else {
                return await this.userInvitationRepository.findOne({ where, relations });
            }
        }
        throw new Error('One of the key must be specify');
    }

    public async generateInvitationLink(lockerID: number, nationalID: string) {
        try {
            const lockerInstance = await this.lockerInstanceService.findInstance({ key: { inUsedLockerID: lockerID } });
            if (lockerInstance.userID !== nationalID) {
                throw new UnauthorizedException('Not owner user');
            }
            const userInvitation = new UserInvitation(lockerInstance);
            await this.userInvitationRepository.save(userInvitation);
            return `${this.configService.liffServerURL}/share?accessCode=${userInvitation.id}`;
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            } else {
                throw new NotFoundException(error.message);
            }
        }
    }

    public async addUserPermission(nationalID: string, accessCode: string) {
        try {
            const userInvitation = await this.findUserInvitation({
                key: { id: accessCode },
            });
            userInvitation.isUsed = true;
            await this.userInvitationRepository.save(userInvitation);
            await this.userService.findUser({ key: { nationalID } });
            await this.lockerInstanceService.addPermissionFromNationalIDAndLockerID(nationalID, userInvitation.lockerID);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            } else {
                throw new NotFoundException(error.message);
            }
        }
    }

    public async revokeUserPermission(ownerNationalID: string, nationalID: string, lockerID: number) {
        try {
            this.lockerInstanceService.revokePermissionFromNationalIDAndLockerID(ownerNationalID, nationalID, lockerID);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            } else {
                throw new NotFoundException(error.message);
            }
        }
    }
}
