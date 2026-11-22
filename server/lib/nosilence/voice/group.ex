# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Voice.Group do
  @moduledoc """
  Orders MLS group changes for one voice channel (the MLS "delivery service").

  The server never sees keys: key packages, commits and Welcome messages are
  opaque bytes created on devices. What the server does decide is the order:

    * Changes (someone joins or leaves) are handled one at a time. For each, one
      member still in the group is asked to make the commit (the committer).
    * A commit is accepted only for the current epoch, so two commits can never
      split the group. Accepted commits go to every other member; a new member
      gets its Welcome.
    * Someone who disconnects is removed by a remaining member, so the key
      changes whoever leaves and however (ADR 0007).

  One process per voice channel with anyone connected; it stops when the
  channel is empty. Sessions (gateway channel processes) are monitored.
  """
  use GenServer, restart: :temporary

  defstruct [
    :channel_id,
    :group_id,
    :epoch,
    # Account ids in the MLS group, in join order (as the server last accepted).
    members: [],
    # user_id => %{pid, key_package}
    sessions: %{},
    queue: [],
    # nil | %{change, committer, timer, ref, tried}
    in_flight: nil
  ]

  ## Client API (called from the gateway)

  @doc """
  Registers a device that wants to join the channel's group. Returns
  `{:create, group_id}` when it should start the group alone, or
  `{:wait, group_id}` when a member will add it.
  """
  def join(channel_id, user_id, pid, key_package) do
    GenServer.call(ensure_started(channel_id), {:join, user_id, pid, key_package})
  end

  @doc "True if `user_id` has a live MLS session (device) in the channel's group."
  def has_session?(channel_id, user_id) do
    case whereis(channel_id) do
      nil -> false
      group -> GenServer.call(group, {:has_session?, user_id})
    end
  catch
    :exit, _ -> false
  end

  @doc "A commit for `epoch` from the committer; `:ok` or `{:error, :stale}`."
  def commit(channel_id, user_id, pid, epoch, commit, welcome) do
    case whereis(channel_id) do
      nil -> {:error, :stale}
      group -> GenServer.call(group, {:commit, user_id, pid, epoch, commit, welcome})
    end
  end

  @doc false
  # For tests: the group's state, or nil when it is not running.
  def state(channel_id) do
    case whereis(channel_id) do
      nil -> nil
      pid -> :sys.get_state(pid)
    end
  catch
    :exit, _ -> nil
  end

  defp ensure_started(channel_id) do
    case DynamicSupervisor.start_child(Nosilence.Voice.GroupSupervisor, {__MODULE__, channel_id}) do
      {:ok, pid} -> pid
      {:error, {:already_started, pid}} -> pid
    end
  end

  defp whereis(channel_id) do
    case Registry.lookup(Nosilence.Voice.GroupRegistry, channel_id) do
      [{pid, _}] -> pid
      [] -> nil
    end
  end

  def start_link(channel_id) do
    GenServer.start_link(__MODULE__, channel_id,
      name: {:via, Registry, {Nosilence.Voice.GroupRegistry, channel_id}}
    )
  end

  ## Server

  @impl true
  def init(channel_id), do: {:ok, %__MODULE__{channel_id: channel_id}}

  @impl true
  def handle_call({:join, user_id, pid, key_package}, _from, state) do
    state = supersede(state, user_id)
    Process.monitor(pid)
    state = put_in(state.sessions[user_id], %{pid: pid, key_package: key_package})

    if state.group_id && Enum.any?(state.members, &live_member?(state, &1, user_id)) do
      state = enqueue(state, {:add, user_id})
      {:reply, {:wait, state.group_id}, dispatch(state)}
    else
      state = restart_group(state, user_id)
      {:reply, {:create, state.group_id}, dispatch(state)}
    end
  end

  def handle_call({:has_session?, user_id}, _from, state),
    do: {:reply, Map.has_key?(state.sessions, user_id), state}

  def handle_call({:commit, user_id, pid, epoch, commit, welcome}, _from, state) do
    with %{change: change, committer: ^user_id, timer: timer} <- state.in_flight,
         %{pid: ^pid} <- state.sessions[user_id],
         ^epoch <- state.epoch,
         :ok <- check_welcome(change, welcome) do
      Process.cancel_timer(timer)
      {:reply, :ok, state |> accept(change, user_id, commit, welcome) |> dispatch()}
    else
      _ -> {:reply, {:error, :stale}, state}
    end
  end

  @impl true
  def handle_info({:DOWN, _ref, :process, pid, _reason}, state) do
    case Enum.find(state.sessions, fn {_, s} -> s.pid == pid end) do
      {user_id, _} -> state |> leave(user_id) |> continue()
      nil -> {:noreply, state}
    end
  end

  def handle_info({:commit_timeout, ref}, %{in_flight: %{ref: ref} = flight} = state) do
    # The committer did not answer: ask the next member, or start over.
    tried = [flight.committer | flight.tried]
    state = %{state | in_flight: nil, queue: [flight.change | state.queue]}

    case committer(state, flight.change, tried) do
      nil -> state |> reset() |> continue()
      _ -> {:noreply, dispatch(state, tried)}
    end
  end

  def handle_info({:commit_timeout, _stale}, state), do: {:noreply, state}

  ## Changes

  defp supersede(state, user_id) do
    # The same account joins again (new tab or reconnect): its old leaf goes.
    case state.sessions[user_id] do
      nil ->
        state

      old ->
        send(old.pid, {:voice_group, "superseded", %{}})
        leave(state, user_id)
    end
  end

  defp leave(state, user_id) do
    {_, sessions} = Map.pop(state.sessions, user_id)
    queue = Enum.reject(state.queue, &(&1 == {:add, user_id}))
    state = %{state | sessions: sessions, queue: queue}

    state =
      case state.in_flight do
        %{change: {:add, ^user_id}, timer: t} ->
          Process.cancel_timer(t)
          %{state | in_flight: nil}

        %{committer: ^user_id, change: change, timer: t} ->
          Process.cancel_timer(t)
          %{state | in_flight: nil, queue: [change | state.queue]}

        _ ->
          state
      end

    if user_id in state.members, do: enqueue(state, {:remove, user_id}), else: state
  end

  # Nobody left: stop. Only people waiting to join: one of them starts afresh.
  defp continue(%{sessions: sessions} = state) when map_size(sessions) == 0,
    do: {:stop, :normal, state}

  defp continue(state) do
    if Enum.any?(state.members, &live_member?(state, &1, nil)) do
      {:noreply, dispatch(state)}
    else
      [creator | _] = Map.keys(state.sessions)
      state = restart_group(state, creator)
      notify(state, creator, "create", %{group_id: Base.encode64(state.group_id)})
      {:noreply, dispatch(state)}
    end
  end

  defp restart_group(state, creator) do
    waiting = state.sessions |> Map.keys() |> List.delete(creator)

    %{
      state
      | group_id: :crypto.strong_rand_bytes(16),
        epoch: 0,
        members: [creator],
        queue: Enum.map(waiting, &{:add, &1}),
        in_flight: cancel(state.in_flight)
    }
  end

  defp reset(state) do
    # Last resort: everyone rejoins with fresh keys and a new group.
    Enum.each(state.sessions, fn {_, s} -> send(s.pid, {:voice_group, "reset", %{}}) end)
    %{state | sessions: %{}, members: [], group_id: nil, epoch: nil, queue: [], in_flight: nil}
  end

  defp cancel(nil), do: nil

  defp cancel(%{timer: t}) do
    Process.cancel_timer(t)
    nil
  end

  defp enqueue(state, change) do
    if change in state.queue, do: state, else: %{state | queue: state.queue ++ [change]}
  end

  defp dispatch(state, tried \\ [])
  defp dispatch(%{in_flight: %{}} = state, _tried), do: state
  defp dispatch(%{queue: []} = state, _tried), do: state

  defp dispatch(%{queue: [change | rest]} = state, tried) do
    state = %{state | queue: rest}

    cond do
      obsolete?(state, change) ->
        dispatch(state, tried)

      committer = committer(state, change, tried) ->
        notify(state, committer, "commit_request", request_payload(state, change))
        ref = make_ref()
        timer = Process.send_after(self(), {:commit_timeout, ref}, commit_timeout())

        flight = %{change: change, committer: committer, timer: timer, ref: ref, tried: tried}
        %{state | in_flight: flight}

      true ->
        %{state | queue: [change | rest]}
    end
  end

  defp obsolete?(state, {:add, user_id}),
    do: user_id in state.members or not Map.has_key?(state.sessions, user_id)

  defp obsolete?(state, {:remove, user_id}), do: user_id not in state.members

  defp committer(state, change, tried) do
    target = elem(change, 1)

    Enum.find(state.members, fn m ->
      m != target and m not in tried and Map.has_key?(state.sessions, m)
    end)
  end

  defp live_member?(state, member, except),
    do: member != except and Map.has_key?(state.sessions, member)

  defp request_payload(state, {:add, user_id}) do
    %{
      epoch: state.epoch,
      op: "add",
      user_id: user_id,
      key_package: Base.encode64(state.sessions[user_id].key_package)
    }
  end

  defp request_payload(state, {:remove, user_id}),
    do: %{epoch: state.epoch, op: "remove", user_id: user_id}

  defp check_welcome({:add, _}, welcome) when is_binary(welcome), do: :ok
  defp check_welcome({:remove, _}, nil), do: :ok
  defp check_welcome(_, _), do: :error

  defp accept(state, change, committer, commit, welcome) do
    members =
      case change do
        {:add, user_id} -> state.members ++ [user_id]
        {:remove, user_id} -> List.delete(state.members, user_id)
      end

    # Everyone already in the group, except the committer, applies the commit.
    for member <- state.members, member != committer, member != elem(change, 1) do
      notify(state, member, "commit", %{epoch: state.epoch, commit: Base.encode64(commit)})
    end

    new_epoch = state.epoch + 1

    with {:add, user_id} <- change do
      notify(state, user_id, "welcome", %{
        epoch: new_epoch,
        welcome: Base.encode64(welcome),
        group_id: Base.encode64(state.group_id)
      })
    end

    %{state | members: members, epoch: new_epoch, in_flight: nil}
  end

  # How long a committer may take before the next member is asked.
  defp commit_timeout,
    do: Application.get_env(:nosilence, __MODULE__, [])[:commit_timeout_ms] || 3_000

  defp notify(state, user_id, event, payload) do
    case state.sessions[user_id] do
      %{pid: pid} -> send(pid, {:voice_group, event, payload})
      nil -> :ok
    end
  end
end
