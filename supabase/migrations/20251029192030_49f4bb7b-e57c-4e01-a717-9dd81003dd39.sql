-- Delete duplicate rows using ctid, keeping only the first occurrence of each unique combination
DELETE FROM merchant_data
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM merchant_data
  GROUP BY pillar, product_type, brand_id, merchant_name, date
);