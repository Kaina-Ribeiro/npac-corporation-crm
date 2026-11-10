-- Nome das mentorias (Igor, 10/11/2026): "Meses" vira só "M" ("Mentoria 2 Meses" → "Mentoria 2M").
-- Vendas já registradas guardam o nome da época (deals é imutável); o relatório usa o nome atual.
UPDATE products SET name = regexp_replace(name, '(\d+)\s+meses\M', '\1M', 'gi')
WHERE name ~* '\d+\s+meses\M';
