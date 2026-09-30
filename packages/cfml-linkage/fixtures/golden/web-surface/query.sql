-- Inert visible SQL fixture.
SELECT o.id
FROM orders o
JOIN users u ON u.id = o.user_id;
