alter table public.appointments
add column service_price_id uuid references public.service_prices(id) on delete set null,
add column selected_option_label text,
add column selected_option_price_amount numeric(10, 2),
add column selected_option_custom_value text,
add column selected_option_original_price numeric(10, 2),
add column selected_option_is_promotional boolean not null default false;

alter table public.appointments
add constraint appointments_selected_option_label_length check (
  selected_option_label is null or char_length(selected_option_label) between 1 and 160
),
add constraint appointments_selected_option_price_nonnegative check (
  selected_option_price_amount is null or selected_option_price_amount >= 0
),
add constraint appointments_selected_option_original_price_nonnegative check (
  selected_option_original_price is null or selected_option_original_price >= 0
);

create index appointments_service_price_idx
on public.appointments (service_price_id)
where service_price_id is not null;

comment on column public.appointments.service_price_id is
'Current menu option selected when the appointment was created. It may become null if the option is later removed.';

comment on column public.appointments.selected_option_label is
'Immutable display snapshot of the session or package option selected at booking time.';

comment on column public.appointments.selected_option_price_amount is
'Price snapshot at booking time; it is not a payment confirmation.';
