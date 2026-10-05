-- Échéancier automatique : relie les paiements aux contrats et génère les
-- échéances attendues (montant + date) dès qu'un contrat est signé, au lieu
-- de compter sur le coach pour créer chaque ligne à la main.

ALTER TABLE public.paiements
  ADD COLUMN IF NOT EXISTS contrat_id uuid REFERENCES public.contrats(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero_echeance int;

-- Une seule échéance par numéro et par contrat (permet de relancer la
-- génération sans jamais créer de doublon).
CREATE UNIQUE INDEX IF NOT EXISTS paiements_contrat_echeance_uniq
  ON public.paiements (contrat_id, numero_echeance)
  WHERE contrat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paiements_contrat ON public.paiements (contrat_id);

-- ── Génère les échéances manquantes d'un contrat ────────────────────────────
-- Engagement fixe (3, 6 mois...) : toutes les échéances d'un coup, à la
-- signature. Sans engagement (engagement_mois NULL, renouvellement mois par
-- mois) : une seule échéance à la fois, la suivante étant créée par
-- trg_paiement_paye_suivant quand la précédente est marquée payée.
-- Ne fait rien pour un contrat sans date de début, ou déjà terminé
-- (date_fin dans le passé) — évite de régénérer un echéancier sur un vieux
-- contrat de test par exemple.
CREATE OR REPLACE FUNCTION public.generer_echeances_contrat(p_contrat_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  c record;
  n_echeances int;
  i int;
  d date;
BEGIN
  SELECT * INTO c FROM public.contrats WHERE id = p_contrat_id;
  IF c IS NULL OR c.date_debut IS NULL THEN RETURN; END IF;
  IF c.date_fin IS NOT NULL AND c.date_fin < CURRENT_DATE THEN RETURN; END IF;

  n_echeances := COALESCE(c.engagement_mois, 1);

  FOR i IN 1..n_echeances LOOP
    d := c.date_debut + ((i - 1) || ' months')::interval;
    INSERT INTO public.paiements (client_id, contrat_id, numero_echeance, montant, description, date_echeance, statut)
    VALUES (
      c.client_id, c.id, i, c.prix_mensuel,
      c.formule_label || ' — échéance ' || i || CASE WHEN c.engagement_mois IS NOT NULL THEN '/' || c.engagement_mois ELSE '' END,
      d, 'en_attente'
    )
    ON CONFLICT (contrat_id, numero_echeance) WHERE contrat_id IS NOT NULL DO NOTHING;
  END LOOP;
END;
$$;

-- ── Déclenche la génération à la signature du contrat ───────────────────────
CREATE OR REPLACE FUNCTION public.trg_contrat_signe_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.statut = 'signe' AND (TG_OP = 'INSERT' OR OLD.statut IS DISTINCT FROM 'signe') THEN
    PERFORM public.generer_echeances_contrat(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrat_signe ON public.contrats;
CREATE TRIGGER trg_contrat_signe
  AFTER INSERT OR UPDATE OF statut ON public.contrats
  FOR EACH ROW EXECUTE FUNCTION public.trg_contrat_signe_fn();

-- ── Enchaîne l'échéance suivante pour un contrat "sans engagement" ─────────
-- (renouvellement mois par mois) une fois la précédente marquée payée.
CREATE OR REPLACE FUNCTION public.trg_paiement_paye_suivant_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  c record;
  d date;
BEGIN
  IF NEW.statut = 'paye' AND OLD.statut IS DISTINCT FROM 'paye'
     AND NEW.contrat_id IS NOT NULL AND NEW.numero_echeance IS NOT NULL THEN
    SELECT * INTO c FROM public.contrats WHERE id = NEW.contrat_id;
    IF c IS NOT NULL AND c.engagement_mois IS NULL THEN
      d := COALESCE(NEW.date_echeance, CURRENT_DATE) + interval '1 month';
      IF c.date_fin IS NULL OR d <= c.date_fin THEN
        INSERT INTO public.paiements (client_id, contrat_id, numero_echeance, montant, description, date_echeance, statut)
        VALUES (c.client_id, c.id, NEW.numero_echeance + 1, c.prix_mensuel, c.formule_label || ' — échéance ' || (NEW.numero_echeance + 1), d, 'en_attente')
        ON CONFLICT (contrat_id, numero_echeance) WHERE contrat_id IS NOT NULL DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paiement_paye_suivant ON public.paiements;
CREATE TRIGGER trg_paiement_paye_suivant
  AFTER UPDATE OF statut ON public.paiements
  FOR EACH ROW EXECUTE FUNCTION public.trg_paiement_paye_suivant_fn();
