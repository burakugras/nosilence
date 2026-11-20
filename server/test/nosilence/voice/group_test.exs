# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Voice.GroupTest do
  use ExUnit.Case, async: true

  alias Nosilence.Voice.Group

  # A fake device: forwards what the group sends it, tagged with its name.
  defp device(name) do
    test = self()

    spawn(fn ->
      receive_loop = fn loop ->
        receive do
          {:voice_group, event, payload} ->
            send(test, {name, event, payload})
            loop.(loop)

          :stop ->
            :ok
        end
      end

      receive_loop.(receive_loop)
    end)
  end

  defp channel, do: Ecto.UUID.generate()

  defp start_group(ch) do
    a = device(:a)
    assert {:create, group_id} = Group.join(ch, "a", a, "kp-a")
    {a, group_id}
  end

  # Adds `name` through committer `by` (pid of device `by_name`).
  defp add(ch, name, {by_name, by}) do
    pid = device(name)
    id = Atom.to_string(name)
    assert {:wait, _} = Group.join(ch, id, pid, "kp-" <> id)
    assert_receive {^by_name, "commit_request", %{op: "add", user_id: ^id, epoch: epoch} = req}
    assert req.key_package == Base.encode64("kp-" <> id)
    assert :ok = Group.commit(ch, Atom.to_string(by_name), by, epoch, "commit+" <> id, "welcome")
    assert_receive {^name, "welcome", %{epoch: new_epoch, welcome: _, group_id: gid}}
    assert new_epoch == epoch + 1
    assert Base.decode64!(gid) == Group.state(ch).group_id
    pid
  end

  test "the first device creates the group; later ones are added by a member" do
    ch = channel()
    {a, group_id} = start_group(ch)
    _b = add(ch, :b, {:a, a})
    assert Group.state(ch).members == ["a", "b"]
    assert Group.state(ch).epoch == 1
    assert Group.state(ch).group_id == group_id

    # The next commit goes to everyone already in the group except the committer.
    _c = add(ch, :c, {:a, a})
    assert_receive {:b, "commit", %{epoch: 1, commit: commit}}
    assert commit == Base.encode64("commit+c")
    refute_received {:a, "commit", _}
  end

  test "only the asked committer, for the current epoch, can commit" do
    ch = channel()
    {a, _} = start_group(ch)
    b = device(:b)
    {:wait, _} = Group.join(ch, "b", b, "kp-b")
    assert_receive {:a, "commit_request", %{epoch: 0}}

    assert {:error, :stale} = Group.commit(ch, "a", a, 5, "c", "w"), "wrong epoch"
    assert {:error, :stale} = Group.commit(ch, "b", b, 0, "c", "w"), "not the committer"
    assert {:error, :stale} = Group.commit(ch, "a", self(), 0, "c", "w"), "not the session"
    assert {:error, :stale} = Group.commit(ch, "a", a, 0, "c", nil), "add needs a Welcome"
    assert :ok = Group.commit(ch, "a", a, 0, "c", "w")
    assert {:error, :stale} = Group.commit(ch, "a", a, 0, "c", "w"), "nothing pending now"
  end

  test "whoever disconnects is removed by a remaining member; they get nothing more" do
    ch = channel()
    {a, _} = start_group(ch)
    _b = add(ch, :b, {:a, a})
    c = add(ch, :c, {:a, a})
    assert_receive {:b, "commit", _}

    Process.exit(c, :kill)
    assert_receive {:a, "commit_request", %{op: "remove", user_id: "c", epoch: 2}}
    assert :ok = Group.commit(ch, "a", a, 2, "remove-c", nil)
    assert_receive {:b, "commit", %{epoch: 2}}
    refute_received {:c, _, _}
    assert Group.state(ch).members == ["a", "b"]
  end

  test "if the committer leaves or does not answer, the next member is asked" do
    ch = channel()
    {a, _} = start_group(ch)
    b = add(ch, :b, {:a, a})
    _c = add(ch, :c, {:a, a})

    # a is asked to add d but disconnects first: d's add and a's removal go to b.
    d = device(:d)
    {:wait, _} = Group.join(ch, "d", d, "kp-d")
    assert_receive {:a, "commit_request", %{user_id: "d"}}
    Process.exit(a, :kill)
    assert_receive {:b, "commit_request", %{user_id: "d", epoch: 2}}

    # b does not answer either: after the timeout c is asked.
    assert_receive {:c, "commit_request", %{user_id: "d", epoch: 2}}, 1_000
    assert {:error, :stale} = Group.commit(ch, "b", b, 2, "late", "w")
  end

  test "when every member is gone, a waiting device starts a new group" do
    ch = channel()
    {a, _} = start_group(ch)
    old_group = Group.state(ch).group_id
    b = device(:b)
    {:wait, _} = Group.join(ch, "b", b, "kp-b")
    assert_receive {:a, "commit_request", _}

    Process.exit(a, :kill)
    assert_receive {:b, "create", %{group_id: gid}}
    assert Base.decode64!(gid) != old_group
    assert Group.state(ch).members == ["b"]
    assert Group.state(ch).epoch == 0
  end

  test "the same account joining again replaces its old device" do
    ch = channel()
    {a, _} = start_group(ch)
    _b = add(ch, :b, {:a, a})

    b2 = device(:b2)
    assert {:wait, _} = Group.join(ch, "b", b2, "kp-b2")
    assert_receive {:b, "superseded", _}
    # Old leaf out first, then the new device in.
    assert_receive {:a, "commit_request", %{op: "remove", user_id: "b", epoch: 1}}
    :ok = Group.commit(ch, "a", a, 1, "remove-b", nil)
    assert_receive {:a, "commit_request", %{op: "add", user_id: "b", epoch: 2}}
  end

  test "the process stops when the channel is empty" do
    ch = channel()
    {a, _} = start_group(ch)
    pid = GenServer.whereis({:via, Registry, {Nosilence.Voice.GroupRegistry, ch}})
    ref = Process.monitor(pid)
    Process.exit(a, :kill)
    # Generous timeout: under a busy test run the chain of exits takes a moment.
    assert_receive {:DOWN, ^ref, :process, ^pid, :normal}, 1_000
    assert Group.state(ch) == nil
  end
end
