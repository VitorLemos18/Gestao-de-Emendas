package br.com.emendas.funding.application;

import br.com.emendas.funding.api.Funding.*;
import java.util.*;

public interface FundingStore {
  List<Parliamentarian> parliamentarians();

  List<Amendment> amendments();

  List<Receipt> receipts();

  Optional<Receipt> receipt(UUID id, boolean lock);

  Optional<AmendmentDocument> amendmentDocument(UUID amendmentId, UUID documentId);

  Optional<AmendmentDocumentInfo> amendmentDocumentByHash(UUID amendmentId, String sha256);

  AmendmentDocumentInfo insertAmendmentDocument(AmendmentDocument document);

  void insert(Parliamentarian p);

  void insert(Amendment a);

  void insert(UUID id, FundingService.NewReceipt receipt);

  boolean update(UUID id, FundingService.EditReceipt receipt);
}
