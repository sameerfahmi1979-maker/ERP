-- Migration: Fix ALL ambiguous column references in generate_next_reference_number
-- Date: 2026-06-08
-- Issue: Multiple ambiguous column references (numbering_rule_id, generated_reference_number)
-- Solution: Use explicit table aliases throughout

create or replace function public.generate_next_reference_number(
  p_rule_code text default null,
  p_document_type_code text default null,
  p_target_table_name text default null,
  p_target_record_id bigint default null,
  p_generation_reason text default null,
  p_generated_by bigint default null
)
returns table(
  generated_reference_number text,
  generated_sequence_number bigint,
  numbering_rule_id bigint,
  sequence_state_id bigint,
  generation_status text
)
language plpgsql
security definer
as $$
declare
  v_rule record;
  v_state record;
  v_next_seq bigint;
  v_formatted_seq text;
  v_generated_ref text;
  v_state_id bigint;
  v_gen_id bigint;
begin
  -- 1. Get and lock the rule
  select r.* into v_rule
  from public.global_numbering_rules r
  where (p_rule_code is not null and r.rule_code = p_rule_code)
     or (p_document_type_code is not null and r.document_type_code = p_document_type_code)
     and r.is_active = true
     and (r.effective_from is null or r.effective_from <= now())
     and (r.effective_to is null or r.effective_to >= now())
  order by r.id desc
  limit 1
  for update;

  if not found then
    raise exception 'No active numbering rule found for rule_code=% or document_type_code=%', p_rule_code, p_document_type_code;
  end if;

  -- 2. Get or create sequence state (locked for update)
  select s.* into v_state
  from public.global_numbering_sequence_states s
  where s.numbering_rule_id = v_rule.id
    and s.reset_period_key = 'GLOBAL'
  for update;

  if not found then
    -- Create new sequence state
    insert into public.global_numbering_sequence_states (
      numbering_rule_id,
      module_code,
      document_type_code,
      document_prefix,
      reset_period_key,
      last_sequence_number,
      next_sequence_number,
      created_by,
      updated_by
    ) values (
      v_rule.id,
      v_rule.module_code,
      v_rule.document_type_code,
      v_rule.document_prefix,
      'GLOBAL',
      0,
      v_rule.starting_sequence_number,
      p_generated_by,
      p_generated_by
    )
    returning * into v_state;
  end if;

  -- 3. Get next sequence number
  v_next_seq := v_state.next_sequence_number;

  -- 4. Format sequence with padding
  v_formatted_seq := lpad(v_next_seq::text, v_rule.sequence_length, v_rule.padding_character);

  -- 5. Build generated reference based on format_template
  v_generated_ref := v_rule.format_template;
  v_generated_ref := replace(v_generated_ref, '{DOC}', v_rule.document_prefix);
  v_generated_ref := replace(v_generated_ref, '{SEQ}', v_formatted_seq);
  v_generated_ref := replace(v_generated_ref, '{SEQ3}', lpad(v_next_seq::text, 3, v_rule.padding_character));
  v_generated_ref := replace(v_generated_ref, '{SEQ4}', lpad(v_next_seq::text, 4, v_rule.padding_character));
  v_generated_ref := replace(v_generated_ref, '{SEQ5}', lpad(v_next_seq::text, 5, v_rule.padding_character));
  v_generated_ref := replace(v_generated_ref, '{SEQ6}', lpad(v_next_seq::text, 6, v_rule.padding_character));
  v_generated_ref := replace(v_generated_ref, '{SEQ12}', lpad(v_next_seq::text, 12, v_rule.padding_character));

  -- 6. Check for duplicate (should never happen due to unique constraint, but defensive)
  -- FIX: Added table alias to resolve ambiguity with return column
  if exists (
    select 1 from public.global_numbering_generated_references g
    where g.generated_reference_number = v_generated_ref
  ) then
    raise exception 'Duplicate reference number detected: %', v_generated_ref;
  end if;

  -- 7. Insert audit record
  insert into public.global_numbering_generated_references (
    numbering_rule_id,
    sequence_state_id,
    generated_reference_number,
    generated_sequence_number,
    module_code,
    document_type_code,
    document_prefix,
    target_table_name,
    target_record_id,
    generation_status,
    generation_reason,
    consumed_at,
    generated_by,
    generated_at,
    created_by,
    updated_by
  ) values (
    v_rule.id,
    v_state.id,
    v_generated_ref,
    v_next_seq,
    v_rule.module_code,
    v_rule.document_type_code,
    v_rule.document_prefix,
    p_target_table_name,
    p_target_record_id,
    'consumed',
    p_generation_reason,
    now(),
    p_generated_by,
    now(),
    p_generated_by,
    p_generated_by
  )
  returning id into v_gen_id;

  -- 8. Update sequence state
  update public.global_numbering_sequence_states
  set
    last_sequence_number = v_next_seq,
    next_sequence_number = v_next_seq + 1,
    last_generated_reference = v_generated_ref,
    last_generated_at = now(),
    updated_at = now(),
    updated_by = p_generated_by
  where id = v_state.id;

  -- 9. Update rule's current/next sequence for UI display
  update public.global_numbering_rules
  set
    current_sequence_number = v_next_seq,
    next_sequence_number = v_next_seq + 1,
    updated_at = now(),
    updated_by = p_generated_by
  where id = v_rule.id;

  -- 10. Return result
  return query select
    v_generated_ref,
    v_next_seq,
    v_rule.id,
    v_state.id,
    'consumed'::text;
end;
$$;

comment on function public.generate_next_reference_number is 'Generate and consume next reference number. Concurrency-safe. Fixed all ambiguous column references.';
