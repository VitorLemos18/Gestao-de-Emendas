ALTER TABLE execution.liquidations
    ADD COLUMN destination_account varchar(100);

ALTER TABLE execution.payments
    ADD COLUMN destination_account varchar(100);
