import { IsString, IsNumber, IsEnum, IsOptional } from 'class-validator';
import { ToInt } from 'class-sanitizer';
import { LockerStatus } from '../../models/locker.model';
import { ApiModelProperty } from '@nestjs/swagger';

export class EditLockerDto {
    @ApiModelProperty({
        description: 'name of a locker determined and seen only by admin',
        required: false,
    })
    @IsOptional()
    @IsString()
    public name: string;

    @ApiModelProperty({
        description: 'location ID where the locker is',
        required: false,
    })
    @IsOptional()
    @IsNumber()
    @ToInt()
    public locationID: number;

    @ApiModelProperty({
        description:
            'number of a locker in the location that is showed on the locker',
        required: false,
    })
    @IsOptional()
    @IsString()
    public number: string;

    @ApiModelProperty({
        description: 'status of locker',
        required: false,
        enum: Object.keys(LockerStatus),
    })
    @IsOptional()
    @IsEnum(LockerStatus)
    public status: LockerStatus;
}
