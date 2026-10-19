CREATE OR REPLACE FUNCTION funding.protect_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  committed numeric(14,2);
  first_commitment date;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Recebimento não pode ser excluído'; END IF;
  IF current_setting('app.receipt_correction', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'Correção de recebimento exige a operação administrativa';
  END IF;
  SELECT COALESCE(SUM(amount),0), MIN(commitment_date)
    INTO committed, first_commitment
    FROM execution.expenses WHERE receipt_id=OLD.id;
  IF NEW.amount < committed THEN
    RAISE EXCEPTION 'Valor do recebimento não pode ficar abaixo dos empenhos registrados';
  END IF;
  IF first_commitment IS NOT NULL AND NEW.credit_date > first_commitment THEN
    RAISE EXCEPTION 'Data do crédito não pode ser posterior a empenho registrado';
  END IF;
  RETURN NEW;
END; $$;
