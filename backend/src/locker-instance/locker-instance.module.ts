import { Module, forwardRef } from '@nestjs/common';
import { LockerInstanceService } from './locker-instance.service';
import { LockerInstanceController } from './locker-instance.controller';
import { DatabaseModule } from 'src/database.module';
import { lockerInstanceProviders } from './locker-instance.providers';
import { LockerModule } from 'src/locker/locker.module';
import { UserModule } from '../user/user.module';
import { LockerUsageModule } from '../locker-usage/locker-usage.module';
import { QrService } from '../qr/qr.service';
import { QrModule } from '../qr/qr.module';

@Module({
    imports: [
        DatabaseModule,
        forwardRef(() => LockerModule),
        UserModule,
        LockerUsageModule,
        QrModule,
    ],
    providers: [...lockerInstanceProviders, LockerInstanceService],
    controllers: [LockerInstanceController],
    exports: [LockerInstanceService],
})
export class LockerInstanceModule { }
