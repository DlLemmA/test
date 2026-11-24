-- One round trip for "new parcel + items + self payments". The old function
-- returned only a parcel id, which forced a second request per child row and
-- could not keep optimistic-concurrency timestamps in the local cache.

drop function if exists public.create_parcel_with_items(jsonb, jsonb[]);

create or replace function public.create_parcel_with_items(
  p_parcel jsonb,
  p_items jsonb[] default '{}'::jsonb[],
  p_payments jsonb[] default '{}'::jsonb[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_parcel public.parcels;
  v_item public.parcel_items;
  v_payment public.payments;
  v_item_json jsonb;
  v_payment_json jsonb;
  v_item_ids bigint[] := '{}'::bigint[];
  v_items jsonb[] := '{}'::jsonb[];
  v_payments jsonb[] := '{}'::jsonb[];
begin
  insert into public.parcels (
    name, status, comment, box_weight_g, shipping_cost_byn,
    shipped_at, received_at, completed_at, created_at
  )
  values (
    nullif(p_parcel ->> 'name', ''),
    coalesce(p_parcel ->> 'status', 'draft'),
    nullif(p_parcel ->> 'comment', ''),
    nullif(p_parcel ->> 'boxWeightG', '')::integer,
    nullif(p_parcel ->> 'shippingCostBYN', '')::numeric,
    nullif(p_parcel ->> 'shippedAt', '')::timestamptz,
    nullif(p_parcel ->> 'receivedAt', '')::timestamptz,
    nullif(p_parcel ->> 'completedAt', '')::timestamptz,
    coalesce(nullif(p_parcel ->> 'createdAt', '')::timestamptz, now())
  )
  returning * into v_parcel;

  foreach v_item_json in array p_items loop
    insert into public.parcel_items (
      parcel_id, name, price_cny, price_byn, quantity, unit,
      customer_id, track_numbers, weights_g, status,
      tracks_completed_at, created_at
    )
    values (
      v_parcel.id,
      v_item_json ->> 'name',
      (v_item_json ->> 'priceCNY')::numeric,
      (v_item_json ->> 'priceBYN')::numeric,
      coalesce((v_item_json ->> 'quantity')::integer, 1),
      coalesce(v_item_json ->> 'unit', 'pcs'),
      (v_item_json ->> 'customerId')::bigint,
      coalesce(v_item_json ->> 'trackNumbers', '[]'),
      coalesce(v_item_json ->> 'weightsG', '[]'),
      coalesce(v_item_json ->> 'status', 'ordered'),
      nullif(v_item_json ->> 'tracksCompletedAt', '')::timestamptz,
      coalesce(nullif(v_item_json ->> 'createdAt', '')::timestamptz, now())
    )
    returning * into v_item;

    v_item_ids := array_append(v_item_ids, v_item.id);
    v_items := array_append(v_items, to_jsonb(v_item));
  end loop;

  -- itemIndex is 1-based into p_items: the client does not know generated ids.
  foreach v_payment_json in array p_payments loop
    insert into public.payments (
      parcel_id, customer_id, item_id, type, paid, paid_at, created_at
    )
    values (
      v_parcel.id,
      (v_payment_json ->> 'customerId')::bigint,
      v_item_ids[(v_payment_json ->> 'itemIndex')::integer],
      coalesce(v_payment_json ->> 'type', 'item'),
      coalesce((v_payment_json ->> 'paid')::boolean, false),
      nullif(v_payment_json ->> 'paidAt', '')::timestamptz,
      coalesce(nullif(v_payment_json ->> 'createdAt', '')::timestamptz, now())
    )
    returning * into v_payment;

    v_payments := array_append(v_payments, to_jsonb(v_payment));
  end loop;

  return jsonb_build_object(
    'parcel', to_jsonb(v_parcel),
    'items', to_jsonb(v_items),
    'payments', to_jsonb(v_payments)
  );
end;
$$;

revoke all on function public.create_parcel_with_items(jsonb, jsonb[], jsonb[]) from public;
revoke all on function public.create_parcel_with_items(jsonb, jsonb[], jsonb[]) from anon;
grant execute on function public.create_parcel_with_items(jsonb, jsonb[], jsonb[]) to authenticated;
