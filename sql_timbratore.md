# Istruzioni per sbloccare il Timbratore Digitale

Per far funzionare il nuovo Timbratore Digitale, devi creare la relativa tabella nel tuo database Supabase.

1. Vai su https://supabase.com e apri il tuo progetto.
2. Vai nel menu a sinistra su **SQL Editor**.
3. Clicca su **New Query**.
4. Copia e incolla il seguente codice, quindi clicca su **Run**:

```sql
CREATE TABLE public.timbrature (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    azienda_id UUID NOT NULL,
    nome_dipendente TEXT NOT NULL,
    ingresso TIMESTAMP WITH TIME ZONE NOT NULL,
    uscita TIMESTAMP WITH TIME ZONE,
    creato_il TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.timbrature ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Timbrature public access" ON public.timbrature FOR ALL USING (true) WITH CHECK (true);
```

Fatto! Ora i tuoi dipendenti potranno timbrare l'ingresso e l'uscita, e tu potrai vedere le presenze e scaricare i report in Excel dal gestionale.
