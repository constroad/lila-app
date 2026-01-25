export interface ValidationError {
    field: string;
    message: string;
}
export declare function validatePhone(phone: string): boolean;
export declare function validateCronExpression(cron: string): boolean;
export declare function validateUrl(url: string): boolean;
export declare function validateSessionPhone(phone: string): boolean;
export declare function validateCronJob(data: any): {
    valid: boolean;
    errors?: ValidationError[];
};
export declare function validateMessage(message: any): boolean;
