ALTER TABLE funding.receipts RENAME COLUMN block_action TO action;
ALTER TABLE funding.receipts ADD COLUMN expense_element varchar(200);
