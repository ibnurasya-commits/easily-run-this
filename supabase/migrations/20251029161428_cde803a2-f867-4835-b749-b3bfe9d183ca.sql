-- Create merchant_data table
CREATE TABLE public.merchant_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pillar TEXT NOT NULL,
  product_type TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  tpt NUMERIC NOT NULL DEFAULT 0,
  tpv NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.merchant_data ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Enable read access for all users"
ON public.merchant_data
FOR SELECT
USING (true);

-- Create policy for authenticated insert
CREATE POLICY "Enable insert for authenticated users"
ON public.merchant_data
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create policy for authenticated update
CREATE POLICY "Enable update for authenticated users"
ON public.merchant_data
FOR UPDATE
TO authenticated
USING (true);

-- Create policy for authenticated delete
CREATE POLICY "Enable delete for authenticated users"
ON public.merchant_data
FOR DELETE
TO authenticated
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_merchant_data_updated_at
BEFORE UPDATE ON public.merchant_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();