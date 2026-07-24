# Istruzioni SQL per sbloccare le tabelle
Copia il seguente codice nel SQL Editor di Supabase e clicca Run. Questo manterrà la sicurezza (RLS abilitato) impostando i permessi corretti per gli utenti autenticati:

```sql
-- 1. AZIENDE
ALTER TABLE public.aziende ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.aziende;
CREATE POLICY "Enable insert for authenticated users" ON public.aziende FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Enable select for authenticated users" ON public.aziende;
CREATE POLICY "Enable select for authenticated users" ON public.aziende FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.aziende;
CREATE POLICY "Enable update for authenticated users" ON public.aziende FOR UPDATE TO authenticated USING (true);

-- 2. PROFILI
ALTER TABLE public.profili ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profili;
CREATE POLICY "Users can manage their own profile" ON public.profili FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 3. GRIGLIE TURNI
ALTER TABLE public.griglie_turni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their company shifts" ON public.griglie_turni;
CREATE POLICY "Users can manage their company shifts" ON public.griglie_turni FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profili WHERE profili.id = auth.uid() AND profili.azienda_id = griglie_turni.azienda_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profili WHERE profili.id = auth.uid() AND profili.azienda_id = griglie_turni.azienda_id)
);

-- 4. STAFF
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their company staff" ON public.staff;
CREATE POLICY "Users can manage their company staff" ON public.staff FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profili WHERE profili.id = auth.uid() AND profili.azienda_id = staff.azienda_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profili WHERE profili.id = auth.uid() AND profili.azienda_id = staff.azienda_id)
);

-- 5. ASSENZE GLOBALI
ALTER TABLE public.assenze_globali ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their company absences" ON public.assenze_globali;
CREATE POLICY "Users can manage their company absences" ON public.assenze_globali FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profili WHERE profili.id = auth.uid() AND profili.azienda_id = assenze_globali.azienda_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profili WHERE profili.id = auth.uid() AND profili.azienda_id = assenze_globali.azienda_id)
);
```
